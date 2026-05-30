"use client";

import Link from "next/link";
import { CATEGORY_META } from "@/domain/agora/qis-seed-generator";
import type { AgoraCategory } from "@/domain/agora/qis-seed-generator";

export interface AgoraThread {
  id: string;
  category: AgoraCategory;
  region: string | null;
  title: string;
  content: string;
  author_name: string;
  is_seed: boolean;
  tags: string[];
  views: number;
  reply_count: number;
  is_hot: boolean;
  created_at: string;
}

interface Props {
  thread: AgoraThread;
  detailUrl: string;
}

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD", ybd: "YBD", cbd: "CBD",
  seongsu: "성수", pangyo: "판교",
  mapo: "마포", jongno: "종로", hongdae: "홍대",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7)  return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function AgoraThreadCard({ thread, detailUrl }: Props) {
  const meta = CATEGORY_META[thread.category] ?? { emoji: "💬", label: thread.category };
  const regionLabel = thread.region ? REGION_LABELS[thread.region] : null;

  return (
    <Link
      href={detailUrl}
      className="block bg-[#131b2e] border border-slate-800 rounded-2xl p-5 hover:border-slate-700 hover:bg-[#161f33] transition-all group"
    >
      {/* Top row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded-full">
          {meta.emoji} {meta.label}
        </span>
        {regionLabel && (
          <span className="text-[10px] font-bold bg-slate-700/50 text-slate-400 px-2.5 py-0.5 rounded-full">
            📍 {regionLabel}
          </span>
        )}
        {thread.is_hot && (
          <span className="text-[10px] font-bold bg-orange-500/20 border border-orange-500/30 text-orange-400 px-2.5 py-0.5 rounded-full animate-pulse">
            🔥 인기
          </span>
        )}
        {thread.is_seed && (
          <span className="text-[10px] text-slate-600 px-1.5">AI 큐레이션</span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-bold text-white leading-snug mb-2 group-hover:text-blue-300 transition-colors line-clamp-2">
        {thread.title}
      </h3>

      {/* Content preview */}
      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">
        {thread.content}
      </p>

      {/* Tags */}
      {thread.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {thread.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-lg">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/20 flex items-center justify-center text-[9px] font-bold text-blue-400">
            {thread.author_name.charAt(0)}
          </div>
          <span className="text-[10px] text-slate-500 font-medium">{thread.author_name}</span>
          <span className="text-[10px] text-slate-700">·</span>
          <span className="text-[10px] text-slate-600">{timeAgo(thread.created_at)}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-600">
          <span>👁 {thread.views}</span>
          <span>💬 {thread.reply_count}</span>
          <span className="text-blue-500 group-hover:translate-x-0.5 transition-transform">→</span>
        </div>
      </div>
    </Link>
  );
}
