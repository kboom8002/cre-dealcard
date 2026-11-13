"use client";

import React, { Suspense } from "react";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";

export default function NewsletterWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F5F7] text-base font-bold text-slate-700">
          뉴스레터 편집실을 불러오는 중입니다…
        </div>
      }
    >
      <MagazineEditorPage />
    </Suspense>
  );
}
