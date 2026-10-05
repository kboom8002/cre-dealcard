import React from 'react';
import { Skeleton, SkeletonGroup, SkeletonText } from '@/components/ui/Skeleton';

/** 매거진 로딩 스켈레톤 — 본문 다크 테마와 같은 배경으로 흰 화면 깜빡임을 없앤다. */
export default function MagazineLoading() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: 'linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)' }}
    >
      <div className="mx-auto max-w-[440px] space-y-5 px-4 pb-28 pt-10">
        <SkeletonGroup label="매거진을 불러오는 중입니다" className="space-y-5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24 bg-white/10" />
              <Skeleton className="h-3 w-16 bg-white/10" />
            </div>
          </div>
          <Skeleton className="h-3 w-40 bg-white/10" />
          <Skeleton className="h-16 w-full rounded-xl bg-white/10" />
          <Skeleton className="h-40 w-full rounded-2xl bg-white/10" />
          <SkeletonText lines={4} />
          <Skeleton className="h-32 w-full rounded-2xl bg-white/10" />
        </SkeletonGroup>
      </div>
    </div>
  );
}
