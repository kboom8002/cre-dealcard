"use client";

import React from "react";
import { Eye, ChevronRight } from "lucide-react";
import { MagazineView } from "@/app/(public)/magazine/[brokerId]/[date]/magazine-view";

interface MagazinePhonePreviewProps {
  previewData: any;
  brokerSlug?: string | null;
  today: string;
}

export function MagazinePhonePreview({
  previewData,
  brokerSlug,
  today,
}: MagazinePhonePreviewProps) {
  return (
    <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 lg:p-10 overflow-y-auto">
      <div className="flex flex-col items-center gap-4">
        {/* 미리보기 라벨 */}
        <div className="flex items-center gap-2 text-slate-500">
          <Eye className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium">실시간 미리보기</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-[10px] text-slate-600">
            iPhone 14 Pro (375×812)
          </span>
        </div>

        {/* 폰 목업 */}
        <div className="w-[375px] h-[812px] bg-[#0B1120] border-[8px] border-slate-900 rounded-[3rem] overflow-hidden shadow-2xl relative flex flex-col shrink-0">
          {/* 노치 */}
          <div className="absolute top-0 inset-x-0 h-6 bg-slate-900 rounded-b-xl z-20 mx-auto w-40" />

          {/* 매거진 뷰 */}
          <div className="flex-1 overflow-y-auto w-full no-scrollbar relative">
            {previewData && (
              <MagazineView
                data={previewData}
                brokerId={brokerSlug || "demo"}
                date={today}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
