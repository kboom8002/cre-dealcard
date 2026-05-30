"use client";

import Link from "next/link";
import { OITICLE_TYPES, AUTHOR_TYPE_META } from "@/domain/pulse/oiticle-types";
import type { OiticleTypeCode, OiticleAuthorType } from "@/domain/pulse/oiticle-types";

interface Props {
  id: string;
  oiticleType: OiticleTypeCode;
  title: string;
  slug: string;
  excerpt: string;
  authorType: OiticleAuthorType;
  authorName: string;
  regions: string[];
  tags: string[];
  views: number;
  likes: number;
  publishedAt: string | null;
}

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD", ybd: "YBD", cbd: "CBD",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function OiticleCard({
  id, oiticleType, title, slug, excerpt,
  authorType, authorName, regions, tags,
  views, likes, publishedAt,
}: Props) {
  const typeDef = OITICLE_TYPES[oiticleType];
  const authorMeta = AUTHOR_TYPE_META[authorType];

  return (
    <Link
      href={`/insight/${slug}`}
      className="block bg-[#131b2e] border border-slate-800 rounded-2xl p-4 hover:border-purple-500/30 hover:bg-[#161f33] transition-all group"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] font-bold bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">
          {typeDef?.emoji} {typeDef?.label}
        </span>
        <span className="text-[9px] text-slate-600">{authorMeta?.badge}</span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-bold text-white mb-1 group-hover:text-purple-300 transition-colors line-clamp-2 leading-snug">
        {title}
      </h3>

      {/* Excerpt */}
      <p className="text-[10px] text-slate-500 line-clamp-2 mb-3 leading-relaxed">
        {excerpt}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[9px] text-slate-600">
          <span>{authorName}</span>
          <span>·</span>
          <span>{formatDate(publishedAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-slate-600">
          <span>👁 {views}</span>
          <span>♥ {likes}</span>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[8px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">
              #{t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
