import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

/**
 * 콘텐츠 스튜디오(매거진 에디터) 로딩 스켈레톤 (U-04).
 * 실제 레이아웃(좌: 에디터 패널 / 우: 폰 미리보기)과 같은 골격을 유지해 레이아웃 점프를 줄인다.
 */
export default function MagazineEditorLoading() {
  return (
    <SkeletonGroup
      label="콘텐츠 스튜디오를 불러오는 중"
      className="min-h-screen bg-[#0B1120] flex flex-col lg:flex-row"
    >
      <div className="w-full lg:w-[460px] bg-[#111827] border-r border-slate-800 flex flex-col h-[55vh] lg:h-screen">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-11 w-20 rounded-xl" />
        </div>
        <div className="flex border-b border-slate-800 gap-1 px-2 py-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11 flex-1 min-w-[44px]" />
          ))}
        </div>
        <div className="flex-1 p-4 space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
      <div className="hidden lg:flex flex-1 items-center justify-center bg-slate-950 p-10">
        <Skeleton className="w-[375px] h-[812px] rounded-[3rem]" />
      </div>
    </SkeletonGroup>
  );
}
