"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/error-state";

/**
 * 콘텐츠 스튜디오 에러 경계 (U-04).
 * 내부 에러 메시지는 그대로 노출하지 않고(console 에만 기록) 사용자 문구 + 재시도를 보여준다.
 * 작성 중이던 내용은 서버 초안에 자동 저장되어 있다는 점을 알려 불안을 줄인다.
 */
export default function MagazineEditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[magazine-editor] Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0B1120] p-6">
      <ErrorState
        className="w-full max-w-md"
        title="콘텐츠 스튜디오를 열지 못했습니다"
        description="일시적인 오류일 수 있습니다. 작성 중이던 내용은 초안으로 자동 저장되어 있습니다. 다시 시도해 주세요."
        onRetry={reset}
        retryLabel="다시 불러오기"
      />
      <Link
        href="/broker"
        className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-body text-ink-muted hover:text-white"
      >
        대시보드로 돌아가기
      </Link>
    </div>
  );
}
