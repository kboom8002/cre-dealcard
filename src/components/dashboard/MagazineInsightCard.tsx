import React from 'react';
import { BarChart3, Users, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

interface MagazineInsightCardProps {
  viewCount?: number;
  subscriberCount?: number;
  lastPublishDate?: string;
}

export function MagazineInsightCard({
  viewCount = 0,
  subscriberCount = 0,
  lastPublishDate,
}: MagazineInsightCardProps) {
  return (
    <Card className="space-y-4" style={{ borderColor: '#ec489940' }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-pink-400">
          <BarChart3 className="w-4 h-4" /> 내 매거진 성과
        </span>
        {lastPublishDate && (
          <span className="text-[10px] text-slate-500">최근 발행: {lastPublishDate}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{viewCount}</span>
          <span className="text-[10px] text-pink-200/70 mt-1">최근 평균 조회수</span>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{subscriberCount}</span>
          <span className="text-[10px] text-pink-200/70 mt-1">활성 구독자</span>
        </div>
      </div>

      <div className="pt-2">
        <Link
          href="/broker/magazine-editor?tab=analytics"
          className="flex items-center justify-center gap-1.5 text-[11px] font-bold w-full py-2.5 rounded-xl bg-pink-500/10 text-pink-300 hover:bg-pink-500/20 transition-all border border-pink-500/20"
        >
          상세 성과 보기 <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  );
}
