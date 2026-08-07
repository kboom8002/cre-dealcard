"use client";

import React from "react";
import Link from "next/link";
import { Users, Package, Target, ChevronRight } from "lucide-react";
import { CircleBadge } from "./CircleBadge";

interface CircleCardProps {
  circle: {
    id: string;
    name: string;
    description: string | null;
    avatar_emoji: string;
    member_count: number;
    shared_asset_count: number;
    pending_match_count: number;
    my_role: string;
  };
}

export function CircleCard({ circle }: CircleCardProps) {
  return (
    <Link
      href={`/broker/circles/${circle.id}`}
      className="block rounded-2xl border border-slate-800 bg-[#131b2e] p-5 hover:border-amber-500/40 hover:bg-[#1a2540] transition-all shadow-md group relative overflow-hidden"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-2xl shrink-0">
            {circle.avatar_emoji || "🤝"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-extrabold text-slate-100 group-hover:text-amber-300 transition-colors">
                {circle.name}
              </h3>
              {circle.my_role === "owner" && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  개설자
                </span>
              )}
            </div>
            {circle.description && (
              <p className="text-[13px] text-slate-400 mt-1 line-clamp-1">
                {circle.description}
              </p>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-300 transition-colors" />
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/80 text-[13px]">
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1.5 font-medium">
            <Users className="w-4 h-4 text-slate-400" />
            멤버 <strong className="text-slate-200 font-bold">{circle.member_count}명</strong>
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <Package className="w-4 h-4 text-slate-400" />
            공유 자산 <strong className="text-slate-200 font-bold">{circle.shared_asset_count}건</strong>
          </span>
        </div>

        {circle.pending_match_count > 0 && (
          <CircleBadge count={circle.pending_match_count} label="S/A 매칭" />
        )}
      </div>
    </Link>
  );
}
