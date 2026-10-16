import React from 'react';
import { BarChart3, Users, ExternalLink, BookOpen, Zap } from 'lucide-react';
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
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-pink-400">
          <BarChart3 className="w-4 h-4" aria-hidden="true" /> 📰 주간 매거진 &amp; 속보 스튜디오
        </span>
        {lastPublishDate && (
          <span className="text-xs text-slate-400">최근 발행: {lastPublishDate}</span>
        )}
      </div>

      <p className="text-xs text-slate-300 leading-relaxed">
        매주 고객에게 보낼 CRE 시장 브리핑과 급매 속보를 만들고, 명함용 구독 QR 코드로 구독자를 모으세요.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{viewCount}</span>
          <span className="text-xs text-pink-200/80 mt-1">최근 평균 조회수</span>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{subscriberCount}</span>
          <span className="text-xs text-pink-200/80 mt-1">활성 구독자</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
        <Link
          href="/broker/magazine-editor"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 px-3 py-2.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/30 transition-all"
        >
          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
          이번 주 매거진 만들기
        </Link>
        <Link
          href="/broker/magazine-editor?tab=outreach"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition-all"
        >
          <Users className="w-3.5 h-3.5" aria-hidden="true" />
          구독자 관리 · QR 코드
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href="/broker/magazine-editor?tab=outreach"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 px-3 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-500/25 transition-all"
        >
          <Zap className="w-3.5 h-3.5" aria-hidden="true" />
          ⚡ 긴급 매물 속보 만들기
        </Link>
        <Link
          href="/broker/magazine-editor?tab=analytics"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-pink-500/10 border border-pink-500/20 px-3 py-2.5 text-xs font-bold text-pink-300 hover:bg-pink-500/20 transition-all"
        >
          상세 성과 보기 <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
